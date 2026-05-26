const mongoose = require('mongoose');

const fraudAlertSchema = new mongoose.Schema(
  {
    id_usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tipo_alerta: {
      type: String,
      enum: [
        'multiplas_rejeicoes',
        'atividade_suspeita',
        'receita_falsificada',
        'dupla_utilizacao',
        'outro',
      ],
      required: true,
    },
    descricao: String,
    nivel_risco: {
      type: String,
      enum: ['baixo', 'medio', 'alto', 'critico'],
      default: 'medio',
    },
    status: {
      type: String,
      enum: ['ativo', 'investigando', 'resolvido', 'falso_positivo'],
      default: 'ativo',
    },
    investigador: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notas_investigacao: String,
    data_resolucao: Date,
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.FraudAlert ||
  mongoose.model('FraudAlert', fraudAlertSchema);
