const mongoose = require('mongoose');
const crypto = require('crypto');

const prescriptionUseLogSchema = new mongoose.Schema(
  {
    id_receita: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prescription',
      required: true,
      index: true,
    },
    id_pedido: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    id_usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    id_farmacia: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pharmacy',
      required: true,
    },
    id_farmaceutico: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status_uso: {
      type: String,
      enum: ['pendente_aprovacao', 'aprovado', 'rejeitado', 'cancelado'],
      default: 'pendente_aprovacao',
      index: true,
    },
    medicamentos_solicitados: [
      {
        id_produto: mongoose.Schema.Types.ObjectId,
        nome_produto: String,
        quantidade: Number,
      },
    ],
    motivo_rejeicao: {
      type: String,
      trim: true,
    },
    token_unico: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    hash_receita: {
      type: String,
      required: true,
    },
    ip_cliente: String,
    user_agent: String,
    data_aprovacao: Date,
    data_rejeicao: Date,
    historico_validacoes: [
      {
        tipo: {
          type: String,
          enum: [
            'validade_receita',
            'crm_medico',
            'medicamento_controlado',
            'dupla_utilizacao',
            'fraude_detectada',
            'aprovado_farmaceutico',
            'rejeitado_farmaceutico',
          ],
        },
        resultado: String,
        timestamp: { type: Date, default: Date.now },
        detalhes: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  {
    timestamps: true,
  }
);

prescriptionUseLogSchema.pre('save', function (next) {
  if (!this.token_unico) {
    this.token_unico = crypto.randomBytes(32).toString('hex');
  }
  if (!this.hash_receita) {
    const data = JSON.stringify({
      id_receita: this.id_receita,
      id_usuario: this.id_usuario,
      id_farmacia: this.id_farmacia,
      medicamentos: this.medicamentos_solicitados,
    });
    this.hash_receita = crypto.createHash('sha256').update(data).digest('hex');
  }
  next();
});

prescriptionUseLogSchema.methods.adicionarValidacao = function (
  tipo,
  resultado,
  detalhes
) {
  this.historico_validacoes.push({
    tipo,
    resultado,
    detalhes,
  });
};

prescriptionUseLogSchema.methods.aprovar = function (id_farmaceutico) {
  this.status_uso = 'aprovado';
  this.id_farmaceutico = id_farmaceutico;
  this.data_aprovacao = new Date();
  this.adicionarValidacao('aprovado_farmaceutico', 'Receita aprovada', {
    farmaceutico: id_farmaceutico,
  });
};

prescriptionUseLogSchema.methods.rejeitar = function (
  id_farmaceutico,
  motivo
) {
  this.status_uso = 'rejeitado';
  this.id_farmaceutico = id_farmaceutico;
  this.motivo_rejeicao = motivo;
  this.data_rejeicao = new Date();
  this.adicionarValidacao('rejeitado_farmaceutico', motivo, {
    farmaceutico: id_farmaceutico,
  });
};

module.exports =
  mongoose.models.PrescriptionUseLog ||
  mongoose.model('PrescriptionUseLog', prescriptionUseLogSchema);
