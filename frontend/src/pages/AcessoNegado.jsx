/**
 * AcessoNegado.jsx
 * Página exibida quando usuário não tem permissão
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import './AcessoNegado.css';

const AcessoNegado = () => {
  const navigate = useNavigate();

  return (
    <div className="acesso-negado-container">
      <div className="acesso-negado-card">
        <div className="acesso-icon">🔐</div>
        
        <h1>Acesso Negado</h1>
        
        <p className="acesso-message">
          Você não tem permissão para acessar esta página.
        </p>

        <div className="acesso-details">
          <p>
            Se acredita que isto é um erro, entre em contato com o suporte.
          </p>
        </div>

        <div className="acesso-actions">
          <button 
            onClick={() => navigate(-1)}
            className="btn btn-secondary"
          >
            ← Voltar
          </button>
          <button 
            onClick={() => navigate('/')}
            className="btn btn-primary"
          >
            Ir para Início
          </button>
        </div>

        <div className="acesso-footer">
          <p>
            <strong>Precisa de ajuda?</strong><br />
            <a href="/suporte">Contate nosso suporte</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AcessoNegado;
