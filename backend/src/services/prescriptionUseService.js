const PrescriptionUseLog = require('../models/PrescriptionUseLog');
const Prescription = require('../models/Prescription');
const Order = require('../models/Order');
const User = require('../models/User');
const FraudAlert = require('../models/FraudAlert');

const REJEICOES_LIMITE = 3;
const DIAS_JANELA_FRAUDE = 7;

class PrescriptionUseService {
  async criarRegistroUso(dadosReceita) {
    const {
      id_receita,
      id_pedido,
      id_usuario,
      id_farmacia,
      medicamentos_solicitados,
      ip_cliente,
      user_agent,
    } = dadosReceita;

    const receita = await Prescription.findById(id_receita);
    if (!receita) {
      throw new Error('Receita não encontrada');
    }

    if (receita.status !== 'Pendente') {
      throw new Error('Receita já foi processada');
    }

    const registroUso = new PrescriptionUseLog({
      id_receita,
      id_pedido,
      id_usuario,
      id_farmacia,
      medicamentos_solicitados,
      ip_cliente,
      user_agent,
    });

    await registroUso.save();
    return registroUso;
  }

  async validarReceita(id_registro_uso, id_farmaceutico, decisao, motivo) {
    const registro = await PrescriptionUseLog.findById(id_registro_uso).populate(
      'id_receita id_usuario'
    );

    if (!registro) {
      throw new Error('Registro de uso não encontrado');
    }

    if (registro.status_uso !== 'pendente_aprovacao') {
      throw new Error('Este registro já foi processado');
    }

    const receita = await Prescription.findById(registro.id_receita);

    // Validações pré-aprovação
    const validacoes = await this.executarValidacoes(
      registro,
      receita,
      id_farmaceutico
    );

    // Verificar se houve bloqueios críticos
    const bloqueios = validacoes.filter((v) => v.bloqueador);
    if (bloqueios.length > 0 && decisao === 'aprovar') {
      throw new Error(
        `Não pode aprovar: ${bloqueios.map((b) => b.resultado).join(', ')}`
      );
    }

    if (decisao === 'aprovar') {
      await this.aprovarReceita(registro, receita, id_farmaceutico);
    } else {
      await this.rejeitarReceita(
        registro,
        receita,
        id_farmaceutico,
        motivo || 'Receita rejeitada'
      );
    }

    return registro;
  }

  async executarValidacoes(registro, receita, id_farmaceutico) {
    const validacoes = [];

    // 1. Validar validade da receita
    const agora = new Date();
    if (receita.validade && receita.validade < agora) {
      validacoes.push({
        tipo: 'validade_receita',
        resultado: 'Receita expirada',
        bloqueador: true,
        detalhes: {
          validade: receita.validade,
          data_atual: agora,
        },
      });
      registro.adicionarValidacao(
        'validade_receita',
        'Receita expirada',
        { validade: receita.validade }
      );
    }

    // 2. Validar CRM do médico
    if (!receita.validacao_crm?.crm_valido) {
      validacoes.push({
        tipo: 'crm_medico',
        resultado: 'CRM do médico não validado',
        bloqueador: true,
        detalhes: {
          crm: receita.dados_ocr?.crm,
          medico: receita.dados_ocr?.nome_medico,
        },
      });
      registro.adicionarValidacao('crm_medico', 'CRM não validado', {
        crm: receita.dados_ocr?.crm,
      });
    }

    // 3. Verificar dupla utilização
    const outrosUsos = await PrescriptionUseLog.countDocuments({
      id_receita: registro.id_receita,
      status_uso: 'aprovado',
    });

    if (outrosUsos > 0) {
      validacoes.push({
        tipo: 'dupla_utilizacao',
        resultado: 'Receita já foi utilizada',
        bloqueador: true,
        detalhes: { usos_anteriores: outrosUsos },
      });
      registro.adicionarValidacao(
        'dupla_utilizacao',
        `Receita já utilizada ${outrosUsos} vez(es)`,
        { usos_anteriores: outrosUsos }
      );
    }

    // 4. Detectar padrões de fraude
    await this.detectorFraude(
      registro,
      validacoes
    );

    await registro.save();
    return validacoes;
  }

  async detectorFraude(registro, validacoes) {
    const usuario = await User.findById(registro.id_usuario);

    // Verificar rejeições anteriores
    const rejeicoes = await PrescriptionUseLog.countDocuments({
      id_usuario: registro.id_usuario,
      status_uso: 'rejeitado',
      createdAt: {
        $gte: new Date(Date.now() - DIAS_JANELA_FRAUDE * 24 * 60 * 60 * 1000),
      },
    });

    if (rejeicoes >= REJEICOES_LIMITE) {
      validacoes.push({
        tipo: 'fraude_detectada',
        resultado: `Usuário com ${rejeicoes} rejeições em ${DIAS_JANELA_FRAUDE} dias`,
        bloqueador: true,
        detalhes: { rejeicoes },
      });

      // Alertar sistema
      if (FraudAlert) {
        await FraudAlert.create({
          id_usuario: registro.id_usuario,
          tipo_alerta: 'multiplas_rejeicoes',
          descricao: `${rejeicoes} receitas rejeitadas em ${DIAS_JANELA_FRAUDE} dias`,
          nivel_risco: 'alto',
        });
      }

      registro.adicionarValidacao(
        'fraude_detectada',
        `${rejeicoes} rejeições`,
        { rejeicoes }
      );
    }

    // Verificar múltiplos pedidos na mesma farmácia em curto período
    const pedidosRecentes = await PrescriptionUseLog.countDocuments({
      id_usuario: registro.id_usuario,
      id_farmacia: registro.id_farmacia,
      createdAt: {
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    if (pedidosRecentes > 5) {
      if (FraudAlert) {
        await FraudAlert.create({
          id_usuario: registro.id_usuario,
          tipo_alerta: 'atividade_suspeita',
          descricao: `${pedidosRecentes} pedidos com receita em 24 horas`,
          nivel_risco: 'medio',
        });
      }
    }
  }

  async aprovarReceita(registro, receita, id_farmaceutico) {
    registro.aprovar(id_farmaceutico);
    receita.status = 'Aprovada';
    receita.farmaceutico_dispensador = id_farmaceutico;
    receita.validado_por = id_farmaceutico;
    receita.validado_em = new Date();
    receita.consumida = true;

    await registro.save();
    await receita.save();

    // Atualizar status do pedido
    await Order.findByIdAndUpdate(registro.id_pedido, {
      $set: { status: 'em_processamento' },
    });
  }

  async rejeitarReceita(registro, receita, id_farmaceutico, motivo) {
    registro.rejeitar(id_farmaceutico, motivo);
    receita.status = 'Rejeitada';
    receita.adicionarHistorico('Rejeitada', id_farmaceutico, motivo);

    await registro.save();
    await receita.save();

    // Atualizar status do pedido
    await Order.findByIdAndUpdate(registro.id_pedido, {
      $set: { 
        status: 'cancelado',
        motivo_cancelamento: `Receita rejeitada: ${motivo}`
      },
    });
  }

  async obterReceitasPendentes(id_farmacia) {
    const registros = await PrescriptionUseLog.find({
      id_farmacia,
      status_uso: 'pendente_aprovacao',
    })
      .populate('id_usuario', 'nome email telefone cpf')
      .populate('id_receita')
      .populate('medicamentos_solicitados.id_produto', 'nome dosagem_produto')
      .sort({ createdAt: -1 });

    return registros;
  }

  async obterHistoricoReceitas(id_usuario) {
    const registros = await PrescriptionUseLog.find({ id_usuario })
      .populate('id_receita')
      .populate('id_farmacia', 'nome')
      .sort({ createdAt: -1 });

    return registros;
  }

  async obterEstatisticasReceitas(id_farmacia) {
    const [total, aprovadas, rejeitadas, pendentes] = await Promise.all([
      PrescriptionUseLog.countDocuments({ id_farmacia }),
      PrescriptionUseLog.countDocuments({
        id_farmacia,
        status_uso: 'aprovado',
      }),
      PrescriptionUseLog.countDocuments({
        id_farmacia,
        status_uso: 'rejeitado',
      }),
      PrescriptionUseLog.countDocuments({
        id_farmacia,
        status_uso: 'pendente_aprovacao',
      }),
    ]);

    return {
      total,
      aprovadas,
      rejeitadas,
      pendentes,
      taxa_aprovacao:
        total > 0 ? ((aprovadas / total) * 100).toFixed(2) : 0,
    };
  }
}

module.exports = new PrescriptionUseService();
