/**
 * VerificacaoPropriedade.jsx
 * Página para proprietário de farmácia comprovar propriedade
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/store';
import './VerificacaoPropriedade.css';

const VerificacaoPropriedade = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(user?.documentVerificationStatus || 'not_submitted');
  const [documentType, setDocumentType] = useState('cpf');
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Redirecionar se não for dono de farmácia
  if (user?.role !== 'dono_farmacia') {
    return (
      <div className="verification-error">
        <h1>Acesso Negado</h1>
        <p>Esta página é apenas para proprietários de farmácia.</p>
        <button onClick={() => navigate('/')}>Voltar ao Início</button>
      </div>
    );
  }

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validar tamanho (máx 5MB)
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError('Arquivo muito grande. Máximo 5MB.');
        return;
      }
      // Validar tipo
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!validTypes.includes(selectedFile.type)) {
        setError('Tipo de arquivo inválido. Aceitar: PDF, JPG, PNG.');
        return;
      }
      setFile(selectedFile);
      setError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Por favor, selecione um arquivo.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('documentType', documentType);
      formData.append('documentFile', file);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/verification/submit-document`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setMessage(data.message);
        setStatus('pending');
        setFile(null);
        setDocumentType('cpf');
      } else {
        setError(data.message || 'Erro ao enviar documento.');
      }
    } catch (err) {
      setError('Erro ao conectar com servidor: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="verification-container">
      <div className="verification-card">
        <div className="verification-header">
          <h1>Verificação de Proprietário</h1>
          <p>Para usar todas as funcionalidades de gerenciamento, você precisa comprovar sua propriedade da farmácia.</p>
        </div>

        {/* Status Badge */}
        <div className={`status-badge status-${status}`}>
          {status === 'not_submitted' && '⏳ Não Enviado'}
          {status === 'pending' && '⏳ Aguardando Análise'}
          {status === 'approved' && '✅ Verificado'}
          {status === 'rejected' && '❌ Rejeitado'}
        </div>

        {/* Status Messages */}
        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        {/* Verification Form */}
        {status === 'not_submitted' || status === 'rejected' ? (
          <form onSubmit={handleSubmit} className="verification-form">
            <div className="form-group">
              <label htmlFor="documentType">Tipo de Documento</label>
              <select
                id="documentType"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                required
              >
                <option value="cpf">CPF (Proprietário)</option>
                <option value="cnpj">CNPJ (Farmácia)</option>
                <option value="rg">RG (Proprietário)</option>
                <option value="residency_proof">Comprovante de Residência</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="document">Arquivo do Documento</label>
              <div className="file-input-wrapper">
                <input
                  id="document"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  required
                  disabled={loading}
                />
                <div className="file-input-placeholder">
                  {file ? (
                    <>
                      <span className="file-icon">📄</span>
                      <span className="file-name">{file.name}</span>
                    </>
                  ) : (
                    <>
                      <span className="upload-icon">📤</span>
                      <span>Clique ou arraste o arquivo aqui</span>
                      <span className="file-hint">PDF, JPG ou PNG (máx 5MB)</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading || !file}
              className="submit-btn"
            >
              {loading ? 'Enviando...' : 'Enviar Documento'}
            </button>
          </form>
        ) : status === 'pending' ? (
          <div className="pending-section">
            <div className="pending-icon">⏳</div>
            <h2>Verificação Pendente</h2>
            <p>Seu documento foi enviado com sucesso. A equipe de verificação analisará em até 24 horas.</p>
            <p className="small-text">Você receberá uma notificação quando o processo for concluído.</p>
          </div>
        ) : status === 'approved' ? (
          <div className="approved-section">
            <div className="approved-icon">✅</div>
            <h2>Verificação Aprovada!</h2>
            <p>Parabéns! Sua identidade foi verificada com sucesso.</p>
            <p>Você agora tem acesso a todas as funcionalidades de proprietário.</p>
            <button 
              onClick={() => navigate('/admin/dashboard')}
              className="action-btn"
            >
              Ir para Dashboard
            </button>
          </div>
        ) : status === 'rejected' ? (
          <div className="rejected-section">
            <div className="rejected-icon">❌</div>
            <h2>Verificação Rejeitada</h2>
            <p>Infelizmente, sua documentação não pôde ser verificada.</p>
            {user?.documentVerification?.rejectionReason && (
              <p className="rejection-reason">
                <strong>Motivo:</strong> {user.documentVerification.rejectionReason}
              </p>
            )}
            <p>Por favor, tente novamente com documentação clara e legível.</p>
          </div>
        ) : null}

        {/* Help Section */}
        <div className="help-section">
          <h3>Documentos Aceitos</h3>
          <ul>
            <li><strong>CPF:</strong> Documento válido e legível</li>
            <li><strong>CNPJ:</strong> Certidão de Inscrição ou Cartão do CNPJ</li>
            <li><strong>RG:</strong> Documento válido (frente e verso)</li>
            <li><strong>Comprovante:</strong> Conta de água, luz ou telefone</li>
          </ul>
          <p className="privacy-note">
            🔒 Seus dados são protegidos pela LGPD. Nunca compartilharemos suas informações pessoais.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VerificacaoPropriedade;
