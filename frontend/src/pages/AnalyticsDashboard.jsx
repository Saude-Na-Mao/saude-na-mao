import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import Logger from '../utils/logger'
import { apiUrl } from '../config/env'

const logger = new Logger('AnalyticsDashboard')

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6']

export default function AnalyticsDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('mes')

  useEffect(() => {
    fetchAnalytics()
  }, [period])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const userId = localStorage.getItem('userId')

      if (!token || !userId) {
        throw new Error('Autenticação necessária')
      }

      const response = await fetch(
        apiUrl(`/pharmacies/${userId}/analytics?period=${period}`),
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      )

      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? 'Sessão expirada'
            : 'Erro ao carregar analytics',
        )
      }

      const result = await response.json()
      if (result.success && result.data) {
        setData(result.data)
      } else {
        throw new Error('Formato de resposta inválido')
      }
    } catch (err) {
      logger.error('Erro ao carregar analytics:', err)
      setError(err.message || 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto mt-6">
        <h2 className="text-red-800 font-bold text-lg">Erro ao Carregar</h2>
        <p className="text-red-700 mt-2">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition"
        >
          Tentar Novamente
        </button>
      </div>
    )
  }

  if (!data) {
    return <div className="text-center text-red-600">Erro ao carregar dados</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Analytics Avançado</h2>
        <div className="flex gap-2">
          {['dia', 'semana', 'mes', 'ano'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded capitalize transition ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            Vendas ao Longo do Tempo
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.vendaFormatted || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="data" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="vendas"
                stroke="#3b82f6"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="receita"
                stroke="#10b981"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
          {(!data.vendaFormatted || data.vendaFormatted.length === 0) && (
            <p className="text-center text-gray-500 mt-2">Sem dados disponíveis</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            Top 10 Medicamentos
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={data.topMedicamentos ? data.topMedicamentos.slice(0, 10) : []}
              layout="vertical"
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="nome" type="category" width={100} />
              <Tooltip />
              <Bar dataKey="vendas" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
          {(!data.topMedicamentos || data.topMedicamentos.length === 0) && (
            <p className="text-center text-gray-500 mt-2">Sem dados disponíveis</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            Distribuição por Categoria
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data.distribuicaoCategoria || []}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  `${name}: ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={80}
                fill="#8884d8"
                dataKey="vendas"
              >
                {COLORS.map((color, index) => (
                  <Cell key={`cell-${index}`} fill={color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            Performance por Horário
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.performanceHorario || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hora" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="vendas" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            Padrão de Fraude (Score)
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.padraoFraude || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="data" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="risco"
                stroke="#ef4444"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">
          Insights Inteligentes
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.insights?.map((insight, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-lg border-l-4 ${
                insight.tipo === 'positivo'
                  ? 'bg-green-50 border-green-500'
                  : insight.tipo === 'negativo'
                    ? 'bg-red-50 border-red-500'
                    : 'bg-yellow-50 border-yellow-500'
              }`}
            >
              <p className="font-bold text-gray-900">{insight.titulo}</p>
              <p className="text-sm text-gray-600 mt-1">{insight.descricao}</p>
              <p className="text-xs text-gray-500 mt-2">
                Confiança: {insight.confianca}%
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">
          Recomendações
        </h3>
        <ul className="space-y-2 text-gray-700">
          {data.recomendacoes?.map((rec, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <span className="text-blue-600 font-bold">•</span>
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
