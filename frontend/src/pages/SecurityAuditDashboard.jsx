import { useEffect, useState } from 'react'
import Logger from '../utils/logger'
import { apiUrl } from '../config/env'

const logger = new Logger('SecurityAuditDashboard')

function SecurityAuditDashboard() {
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedLog, setSelectedLog] = useState(null)

  useEffect(() => {
    fetchAuditLogs()
  }, [filter])

  const fetchAuditLogs = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')

      if (!token) {
        throw new Error('Autenticação necessária')
      }

      const response = await fetch(
        apiUrl(`/audit?filter=${filter}&limit=50`),
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      )

      if (!response.ok) {
        throw new Error('Erro ao carregar logs de auditoria')
      }

      const data = await response.json()

      if (data.logs && Array.isArray(data.logs)) {
        setAuditLogs(data.logs)
      } else {
        setAuditLogs([])
      }
    } catch (err) {
      logger.error('Erro ao carregar audit logs:', err)
      setAuditLogs([])
    } finally {
      setLoading(false)
    }
  }

  const getSeverityColor = (status) => {
    switch (status) {
      case 'critico':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'info':
        return 'bg-blue-100 text-blue-800 border-blue-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getActionBadgeColor = (acao) => {
    if (acao.includes('DELETE') || acao.includes('CANCEL'))
      return 'bg-red-50 text-red-700 border border-red-300'
    if (acao.includes('CREATE') || acao.includes('INSERT'))
      return 'bg-green-50 text-green-700 border border-green-300'
    if (acao.includes('UPDATE') || acao.includes('MODIFY'))
      return 'bg-blue-50 text-blue-700 border border-blue-300'
    return 'bg-gray-50 text-gray-700 border border-gray-300'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Auditoria de Segurança</h2>
        <button
          onClick={fetchAuditLogs}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
        >
          🔄 Atualizar
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Filtros</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['all', 'critico', 'warning', 'info'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded capitalize transition ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
              }`}
            >
              {f === 'all' ? 'Todos' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {auditLogs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            Nenhum registro de auditoria encontrado
          </div>
        ) : (
          auditLogs.map((log) => (
            <div
              key={log._id}
              className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition cursor-pointer"
              onClick={() => setSelectedLog(log)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${getActionBadgeColor(log.acao)}`}>
                      {log.acao}
                    </span>
                    <span className="text-gray-600 text-sm">
                      {log.recurso}
                      {log.recurso_id && ` - ${log.recurso_id}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600 mt-2">
                    <span>👤 {log.usuario_email || 'Desconhecido'}</span>
                    <span>🌐 {log.ip_origem}</span>
                    <span>⏱️ {new Date(log.criado_em).toLocaleString('pt-BR')}</span>
                  </div>

                  {log.descricao && (
                    <p className="text-sm text-gray-700 mt-2 italic">
                      "{log.descricao}"
                    </p>
                  )}
                </div>

                <span
                  className={`px-3 py-1 rounded text-sm font-bold ${getSeverityColor(
                    log.status,
                  )}`}
                >
                  {log.status === 'sucesso' ? '✅' : '❌'} {log.status}
                </span>
              </div>

              {log.motivo_falha && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded p-2">
                  <p className="text-sm text-red-700">
                    <strong>Motivo:</strong> {log.motivo_falha}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {selectedLog && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                Detalhes do Log
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Ação</p>
                  <p className="font-bold text-gray-900">{selectedLog.acao}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Recurso</p>
                  <p className="font-bold text-gray-900">{selectedLog.recurso}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Usuário</p>
                  <p className="font-bold text-gray-900">
                    {selectedLog.usuario_email}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">IP</p>
                  <p className="font-bold text-gray-900">{selectedLog.ip_origem}</p>
                </div>
              </div>

              {selectedLog.valores_anteriores && (
                <div className="bg-red-50 p-3 rounded border border-red-200">
                  <p className="font-bold text-red-900 mb-2">
                    Valores Anteriores
                  </p>
                  <pre className="text-xs text-red-800 overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.valores_anteriores, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.valores_novos && (
                <div className="bg-green-50 p-3 rounded border border-green-200">
                  <p className="font-bold text-green-900 mb-2">
                    Valores Novos
                  </p>
                  <pre className="text-xs text-green-800 overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.valores_novos, null, 2)}
                  </pre>
                </div>
              )}

              <div className="bg-gray-50 p-3 rounded">
                <p className="text-xs text-gray-600">
                  Data: {new Date(selectedLog.criado_em).toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-gray-600">
                  User Agent: {selectedLog.user_agent}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SecurityAuditDashboard
