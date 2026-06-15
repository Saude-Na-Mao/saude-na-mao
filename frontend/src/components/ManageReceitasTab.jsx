import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/store';
import { AlertCircle, CheckCircle, XCircle, Eye, MoreVertical, Loader } from 'lucide-react';
import { apiUrl } from '../config/env';

const RECEITAS_API_BASE = apiUrl('/receitas');

export function ManageReceitasTab({ id_farmacia }) {
  const { token, user } = useAuthStore();
  const [receitas, setReceitas] = useState([]);
  const [historicoReceitas, setHistoricoReceitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedReceita, setSelectedReceita] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [stats, setStats] = useState(null);
  const [farmaciaId, setFarmaciaId] = useState(
    id_farmacia ||
      user?.dados_farmaceutico?.id_farmacia ||
      user?.id_farmacia ||
      null
  );

  useEffect(() => {
    if (!token) {
      setError('Usuário não autenticado');
      setLoading(false);
      return;
    }

    if (!farmaciaId) {
      resolverFarmaciaDoFarmaceutico();
      return;
    }

    carregarDadosIniciais();
  }, [farmaciaId, token]);

  const resolverFarmaciaDoFarmaceutico = async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(apiUrl('/pharmacists/me'), { headers });
      if (!res.ok) throw new Error('Farmácia do farmacêutico não identificada');
      const data = await res.json();
      const resolvedId = data?.data?.pharmacist?.id_farmacia?._id || data?.data?.pharmacist?.id_farmacia;
      if (!resolvedId) throw new Error('Farmácia do farmacêutico não identificada');
      setFarmaciaId(resolvedId);
    } catch (err) {
      setError('Farmácia do farmacêutico não identificada');
      setLoading(false);
    }
  };

  const carregarDadosIniciais = async () => {
    await carregarReceitas();
    await carregarEstatisticas();
    await carregarHistoricoReceitas();
  };

  const carregarReceitas = async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = { 'Authorization': `Bearer ${token}` };

      const params = new URLSearchParams({
        status: 'Pendente,Em Análise',
        page: '1',
        limit: '100',
        pharmacyId: String(farmaciaId),
      });
      const res = await fetch(`${RECEITAS_API_BASE}/admin/all?${params.toString()}`, { headers });

      if (!res.ok) throw new Error('Erro ao carregar receitas');

      const data = await res.json();
      setReceitas(Array.isArray(data?.data?.receitas) ? data.data.receitas : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const carregarEstatisticas = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const params = new URLSearchParams({
        status: 'todos',
        page: '1',
        limit: '500',
        pharmacyId: String(farmaciaId),
      });
      const res = await fetch(`${RECEITAS_API_BASE}/admin/all?${params.toString()}`, { headers });

      if (res.ok) {
        const data = await res.json();
        const lista = Array.isArray(data?.data?.receitas) ? data.data.receitas : [];
        const total = lista.length;
        const aprovadas = lista.filter((r) => r.status === 'Aprovada').length;
        const rejeitadas = lista.filter((r) => r.status === 'Rejeitada').length;
        const pendentes = lista.filter((r) => ['Pendente', 'Em Análise'].includes(r.status)).length;
        setStats({ total, aprovadas, rejeitadas, pendentes });
      }
    } catch (err) {
      console.error('Erro ao carregar estatísticas:', err);
    }
  };

  const carregarHistoricoReceitas = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const params = new URLSearchParams({
        status: 'todos',
        page: '1',
        limit: '200',
        pharmacyId: String(farmaciaId),
      });
      const res = await fetch(`${RECEITAS_API_BASE}/admin/all?${params.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const lista = Array.isArray(data?.data?.receitas) ? data.data.receitas : [];
        setHistoricoReceitas(lista.filter((r) => !['Pendente', 'Em Análise'].includes(r.status)));
      }
    } catch {}
  };

  const handleAprovar = async () => {
    await processarReceita('aprovar');
  };

  const handleRejeitar = async () => {
    if (!rejectReason.trim()) {
      alert('Por favor, informar o motivo da rejeição');
      return;
    }
    await processarReceita('rejeitar', rejectReason);
  };

  const processarReceita = async (decisao, motivo = '') => {
    try {
      setActionInProgress(true);
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const body = {
        aprovado: decisao === 'aprovar',
        observacoes: motivo,
      };

      const res = await fetch(`${RECEITAS_API_BASE}/admin/${selectedReceita._id}/validate`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Erro ao processar receita');
      }

      // Atualizar lista
      await carregarReceitas();
      await carregarEstatisticas();
      await carregarHistoricoReceitas();
      setShowModal(false);
      setSelectedReceita(null);
      setRejectReason('');
      
      alert(`Receita ${decisao === 'aprovar' ? 'aprovada' : 'rejeitada'} com sucesso!`);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      setActionInProgress(false);
    }
  };

  const abrirModal = (receita) => {
    setSelectedReceita(receita);
    setShowModal(true);
    setRejectReason('');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
        <AlertCircle className="w-5 h-5 inline mr-2" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Estatísticas */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
            <div className="text-sm text-gray-600">Total de Receitas</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">{stats.aprovadas}</div>
            <div className="text-sm text-gray-600">Aprovadas</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-600">{stats.rejeitadas}</div>
            <div className="text-sm text-gray-600">Rejeitadas</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.pendentes}</div>
            <div className="text-sm text-gray-600">Pendentes</div>
          </div>
        </div>
      )}

      {/* Lista de Receitas */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Receitas Pendentes de Aprovação</h3>
          <p className="text-sm text-gray-500">{receitas.length} receita(s) aguardando análise</p>
        </div>

        <div className="overflow-x-auto">
          {receitas.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2 opacity-50" />
              <p className="text-gray-600">Nenhuma receita pendente no momento</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Paciente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Medicamentos</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Data Envio</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {receitas.map((receita) => (
                  <tr key={receita._id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{receita.id_usuario?.nome}</div>
                      <div className="text-sm text-gray-500">{receita.id_usuario?.email || receita.id_usuario?.cpf}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="text-sm text-gray-600">
                          • {receita.dados_ocr?.principio_ativo || receita.nome_arquivo || 'Medicamento informado na receita'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(receita.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                        {receita.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => abrirModal(receita)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition"
                          title="Ver detalhes"
                        >
                          <Eye className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Histórico de Receitas */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Histórico de Receitas</h3>
          <p className="text-sm text-gray-500">{historicoReceitas.length} registro(s)</p>
        </div>
        <div className="overflow-x-auto">
          {historicoReceitas.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">Nenhum histórico encontrado</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Paciente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Resposta</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {historicoReceitas.map((item) => (
                  <tr key={item._id}>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {item.id_usuario?.nome || 'Paciente'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {item.status || 'PENDENTE'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {item.validado_em ? 'Respondida' : 'Aguardando'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal de Aprovação */}
      {showModal && selectedReceita && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Validar Receita</h2>
              <p className="text-sm text-gray-600 mt-1">
                Paciente: {selectedReceita.id_usuario?.nome}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Informações da Receita */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">CPF do Paciente</label>
                  <p className="text-gray-900">{selectedReceita.id_usuario?.cpf}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Medicamentos Solicitados</label>
                  <div className="space-y-2 mt-2">
                    <div className="text-sm text-gray-600">
                      • {selectedReceita.dados_ocr?.principio_ativo || selectedReceita.nome_arquivo || 'Informações no arquivo da receita'}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Arquivo da Receita</label>
                  {(selectedReceita.url_imagem_publica || selectedReceita.url_arquivo) && (
                    <a 
                      href={selectedReceita.url_imagem_publica || selectedReceita.url_arquivo}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm block mt-1"
                    >
                      Abrir receita digital
                    </a>
                  )}
                </div>
              </div>

              {/* Motivo de rejeição (se aplicável) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Motivo da Rejeição (se for rejeitar)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Ex: CRM do médico inválido, receita expirada, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  rows={3}
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
                disabled={actionInProgress}
              >
                Cancelar
              </button>
              <button
                onClick={handleRejeitar}
                className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2"
                disabled={actionInProgress}
              >
                {actionInProgress ? <Loader className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Rejeitar
              </button>
              <button
                onClick={handleAprovar}
                className="px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
                disabled={actionInProgress}
              >
                {actionInProgress ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Aprovar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
