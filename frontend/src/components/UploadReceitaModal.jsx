import React, { useState } from 'react';
import { Upload, X, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useAuthStore } from '../stores/store';
import { apiUrl } from '../config/env';

const API_BASE = apiUrl('/prescriptions');

export function UploadReceitaModal({ isOpen, onClose, onReceitaUpload, medicamentosControlados }) {
  const { token } = useAuthStore();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [tipoReceita, setTipoReceita] = useState('simples');
  const [uploadedReceita, setUploadedReceita] = useState(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = ['application/pdf', 'application/xml', 'text/xml'];
      if (!validTypes.includes(selectedFile.type)) {
        setError('Apenas arquivos PDF ou XML assinados são permitidos');
        return;
      }
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError('Arquivo não pode ser maior que 5MB');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append('receita', file);
      formData.append('tipo_receita', tipoReceita);

      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Erro ao fazer upload da receita');
      }

      const data = await res.json();
      setSuccess(true);
      setUploadedReceita(data.data.receita);

      // Notificar componente pai
      if (onReceitaUpload) {
        onReceitaUpload(data.data.receita);
      }

      // Fechar modal após 2 segundos
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setError(null);
    setSuccess(false);
    setUploadedReceita(null);
    setTipoReceita('simples');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Receita Digital</h2>
            <p className="text-sm text-gray-600 mt-1">
              Envie o PDF ou XML assinado eletronicamente para validação
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {success ? (
          <div className="p-6 flex flex-col items-center justify-center text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Receita Enviada com Sucesso!
            </h3>
            <p className="text-gray-600 text-sm">
              Um farmacêutico analisará sua receita em breve.
              Você receberá uma notificação quando a receita for aprovada ou rejeitada.
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Informações sobre tipos de receita */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>Tipos de Receita:</strong>
              </p>
              <ul className="text-sm text-blue-800 mt-2 space-y-1 ml-4">
                <li>• <strong>Simples:</strong> Medicamentos comuns (30 dias de validade)</li>
                <li>• <strong>Especial C1:</strong> Controlado (30 dias)</li>
                <li>• <strong>Especial B:</strong> Muito controlado (30 dias)</li>
                <li>• <strong>Antimicrobiano:</strong> Antibióticos (10 dias)</li>
              </ul>
            </div>

            {/* Seleção de tipo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Receita
              </label>
              <select
                value={tipoReceita}
                onChange={(e) => setTipoReceita(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="simples">Receita Simples</option>
                <option value="especial_c1">Receita Especial C1</option>
                <option value="especial_b">Receita Especial B</option>
                <option value="antimicrobiano">Receita Antimicrobiano</option>
              </select>
            </div>

            {/* Upload de arquivo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Arquivo da Receita
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-primary hover:bg-opacity-5 transition">
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                  id="receita-input"
                  accept=".pdf,.xml,application/pdf,application/xml,text/xml"
                />
                <label htmlFor="receita-input" className="cursor-pointer flex flex-col items-center">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="font-medium text-gray-700">
                    {file ? file.name : 'Clique ou arraste para selecionar'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    PDF ou XML assinado até 5MB
                  </p>
                </label>
              </div>
            </div>

            {/* Informações importantes */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm font-medium text-yellow-900">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                Informações Importantes
              </p>
              <ul className="text-sm text-yellow-800 mt-2 space-y-1 ml-4">
                <li>• Cada receita só pode ser usada uma única vez</li>
                <li>• Receita inválida ou duplicada será rejeitada</li>
                <li>• Você será notificado sobre aprovação ou rejeição</li>
                <li>• Tentar fraudar pode resultar em bloqueio da conta</li>
              </ul>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        {!success && (
          <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              onClick={handleUpload}
              className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary-dark transition disabled:opacity-50 flex items-center gap-2"
              disabled={loading || !file}
            >
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {loading ? 'Enviando...' : 'Enviar Receita'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
