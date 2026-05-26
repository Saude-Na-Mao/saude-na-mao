import React, { useState, useEffect } from 'react';
import './DrugInteractionAlert.css';
import { apiUrl } from '../config/env';

export function DrugInteractionAlert({ medicamentos, onValidate, onCancel }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    verificarInteracoes();
  }, [medicamentos]);

  const verificarInteracoes = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(apiUrl('/drugs/check-interactions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ medicamentos })
      });

      if (!response.ok) throw new Error('Erro ao verificar interações');
      
      const data = await response.json();
      setResult(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="drug-alert-container loading">
        <div className="spinner"></div>
        <p>Analisando medicamentos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="drug-alert-container error">
        <h3>⚠️ Erro ao verificar</h3>
        <p>{error}</p>
        <button onClick={onCancel}>Voltar</button>
      </div>
    );
  }

  if (!result) return null;

  const statusConfig = {
    SEGURO: { color: '#22c55e', icon: '✅', label: 'Seguro' },
    CUIDADO: { color: '#f59e0b', icon: '⚠️', label: 'Cuidado - Aviso' },
    PERIGO: { color: '#ef4444', icon: '🚫', label: 'Perigo - Bloqueado' }
  };

  const config = statusConfig[result.status] || statusConfig.SEGURO;

  return (
    <div className="drug-alert-container" style={{ borderLeftColor: config.color }}>
      <div className="alert-header">
        <span className="status-icon">{config.icon}</span>
        <h3>{config.label}</h3>
        <span className="score">Score: {result.scoreSeguranca}/100</span>
      </div>

      {result.alertas && result.alertas.length > 0 && (
        <div className="alertas-list">
          {result.alertas.map((alerta, idx) => (
            <div key={idx} className={`alerta-item severity-${alerta.severidade}`}>
              <h4>{alerta.medicamento1} + {alerta.medicamento2}</h4>
              <p className="severity">{alerta.severidade}</p>
              
              {alerta.efeitos && (
                <div className="efeitos">
                  <strong>Possíveis efeitos:</strong>
                  <ul>
                    {alerta.efeitos.map((efeito, i) => (
                      <li key={i}>{efeito}</li>
                    ))}
                  </ul>
                </div>
              )}

              {alerta.recomendacao && (
                <div className="recomendacao">
                  <strong>💊 Recomendação:</strong>
                  <p>{alerta.recomendacao}</p>
                </div>
              )}

              {alerta.alternativas && alerta.alternativas.length > 0 && (
                <div className="alternativas">
                  <strong>🔄 Alternativas seguras:</strong>
                  {alerta.alternativas.map((alt, i) => (
                    <div key={i} className="alt-item">
                      <p>{alt.nome}</p>
                      <small>{alt.motivo}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="alert-footer">
        <p className="recommendation">{result.recomendacaoFinal}</p>

        <div className="actions">
          {result.status === 'PERIGO' ? (
            <button className="btn-cancel" onClick={onCancel}>
              ❌ Cancelar Compra
            </button>
          ) : (
            <>
              <button className="btn-cancel" onClick={onCancel}>
                Cancelar
              </button>
              <button className="btn-validate" onClick={() => onValidate(result)}>
                ✅ {result.requerFarmaceutico ? 'Pedir Validação do Farmacêutico' : 'Continuar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
