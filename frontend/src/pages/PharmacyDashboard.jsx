import React, { useState, useEffect } from 'react';
import './PharmacyDashboard.css';
import { apiUrl } from '../config/env';

export function PharmacyDashboard() {
  const [period, setPeriod] = useState('month'); // day, week, month, year
  const [metrics, setMetrics] = useState({
    vendas_total: 0,
    vendas_mes: 0,
    medicamentos_vendidos: 0,
    adesao_farmaceutico: 0,
    taxa_conversao: 0,
  });

  const [topMedicines, setTopMedicines] = useState([]);
  const [salesChart, setSalesChart] = useState([]);
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const farmaciaId = localStorage.getItem('farmacia_id');

      const [metricsRes, medicinesRes, chartRes, alertsRes] = await Promise.all([
        fetch(apiUrl(`/pharmacies/${farmaciaId}/metrics?period=${period}`), {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(apiUrl(`/pharmacies/${farmaciaId}/top-medicines?limit=10`), {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(apiUrl(`/pharmacies/${farmaciaId}/sales-chart?period=${period}`), {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(apiUrl(`/pharmacies/${farmaciaId}/risk-alerts`), {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
      ]);

      if (metricsRes.ok) setMetrics((await metricsRes.json()).data);
      if (medicinesRes.ok) setTopMedicines((await medicinesRes.json()).data);
      if (chartRes.ok) setSalesChart((await chartRes.json()).data);
      if (alertsRes.ok) setRiskAlerts((await alertsRes.json()).data);
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Carregando...</div>;
  }

  return (
    <div className="pharmacy-dashboard">
      <header className="dashboard-header">
        <h1>📊 Dashboard da Farmácia</h1>
        <div className="period-selector">
          {['day', 'week', 'month', 'year'].map(p => (
            <button
              key={p}
              className={`period-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p === 'day' ? 'Dia'  : p === 'week' ? 'Semana' : p === 'month' ? 'Mês' : 'Ano'}
            </button>
          ))}
        </div>
      </header>

      {/* Metrics */}
      <div className="metrics-grid">
        <MetricCard
          title="Vendas Totais"
          value={`R$ ${metrics.vendas_total.toFixed(2)}`}
          subtext={`Este ${period}`}
          icon="💰"
          trend={+12}
        />
        <MetricCard
          title="Medicamentos Vendidos"
          value={metrics.medicamentos_vendidos}
          subtext="unidades"
          icon="💊"
          trend={+8}
        />
        <MetricCard
          title="Adesão Farmacêutico"
          value={`${metrics.adesao_farmaceutico}%`}
          subtext="validações com IA"
          icon="👤"
          trend={+5}
        />
        <MetricCard
          title="Taxa de Conversão"
          value={`${metrics.taxa_conversao}%`}
          subtext="carrinho → pedido"
          icon="📈"
          trend={+3}
        />
      </div>

      <div className="dashboard-content">
        {/* Top Medicines */}
        <section className="top-medicines">
          <h2>💊 Top Medicamentos</h2>
          <div className="medicines-list">
            {topMedicines.map((med, idx) => (
              <div key={idx} className="medicine-row">
                <div className="rank">#{idx + 1}</div>
                <div className="medicine-info">
                  <h3>{med.nome}</h3>
                  <p>{med.principio_ativo}</p>
                </div>
                <div className="medicine-stats">
                  <div className="stat">
                    <span className="label">Vendas</span>
                    <span className="value">{med.vendas}</span>
                  </div>
                  <div className="stat">
                    <span className="label">Receita</span>
                    <span className="value">R$ {med.receita.toFixed(2)}</span>
                  </div>
                  <div className="stat">
                    <span className="label">Interações</span>
                    <span className="badge">{med.interacoes_detectadas}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sales Chart */}
        <section className="sales-chart">
          <h2>📈 Vendas por Período</h2>
          <div className="chart-placeholder">
            {salesChart.length > 0 ? (
              <SimpleChart data={salesChart} />
            ) : (
              <p>Sem dados disponíveis</p>
            )}
          </div>
        </section>

        {/* Risk Alerts */}
        <section className="risk-alerts full-width">
          <h2>🚨 Alertas de Risco & Fraude</h2>
          {riskAlerts.length === 0 ? (
            <div className="empty-state">
              <p>✅ Nenhum alerta no momento</p>
            </div>
          ) : (
            <div className="alerts-grid">
              {riskAlerts.map(alert => (
                <RiskAlertCard key={alert._id} alert={alert} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({ title, value, subtext, icon, trend }) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="icon">{icon}</span>
        <span className={`trend ${trend > 0 ? 'up' : 'down'}`}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </span>
      </div>
      <div className="metric-body">
        <h3>{title}</h3>
        <p className="value">{value}</p>
        <p className="subtext">{subtext}</p>
      </div>
    </div>
  );
}

function SimpleChart({ data }) {
  if (data.length === 0) return null;

  const maxValue = Math.max(...data.map(d => d.valor));
  
  return (
    <div className="simple-chart">
      <div className="chart-bars">
        {data.map((d, idx) => (
          <div key={idx} className="bar-wrapper">
            <div
              className="bar"
              style={{ height: `${(d.valor / maxValue) * 100}%` }}
              title={`${d.label}: R$ ${d.valor}`}
            />
            <span className="label">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskAlertCard({ alert }) {
  const severityColors = {
    baixo: '#10b981',
    medio: '#f59e0b',
    alto: '#ef4444',
  };

  return (
    <div className="risk-alert-card" style={{ borderColor: severityColors[alert.severidade] }}>
      <div className="alert-severity" style={{ background: severityColors[alert.severidade] }}>
        {alert.severidade.toUpperCase()}
      </div>
      <div className="alert-content">
        <h4>{alert.tipo_alerta}</h4>
        <p>{alert.descricao}</p>
        <div className="alert-meta">
          <span>Pedido: #{alert.numero_pedido}</span>
          <span>Cliente: {alert.cliente_nome}</span>
          <span>{new Date(alert.data_criacao).toLocaleDateString('pt-BR')}</span>
        </div>
      </div>
      <div className="alert-action">
        <button className="btn-review">Analisar</button>
      </div>
    </div>
  );
}

export default PharmacyDashboard
