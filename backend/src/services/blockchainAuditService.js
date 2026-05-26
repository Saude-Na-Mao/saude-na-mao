const crypto = require("crypto");
const Logger = require("../utils/logger");

const logger = new Logger("BlockchainAuditService");

class BlockchainAuditService {
  constructor() {
    this.chain = [];
    this.pendingTransactions = [];
    this.difficulty = 4;
    this.minerReward = 1;
    this.initializeChain();
  }

  initializeChain() {
    const genesisBlock = new Block(0, Date.now(), [], "0");
    this.chain.push(genesisBlock);
  }

  createTransaction(data) {
    const transaction = {
      timestamp: Date.now(),
      data,
      hash: this.calculateHash(data),
    };
    this.pendingTransactions.push(transaction);
    logger.info("Transação adicionada à fila de pendentes");
    return transaction.hash;
  }

  minePendingTransactions() {
    const block = new Block(
      this.chain.length,
      Date.now(),
      this.pendingTransactions,
      this.getLatestBlock().hash,
    );

    while (!block.hasValidProof(this.difficulty)) {
      block.nonce++;
    }

    block.hash = block.calculateBlockHash();
    this.chain.push(block);
    this.pendingTransactions = [];

    logger.info(
      `Bloco #${block.index} minado com sucesso. Hash: ${block.hash}`,
    );
    return block;
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  calculateHash(data) {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if (!currentBlock.hasValidProof(this.difficulty)) {
        logger.warn(`Bloco #${i} tem prova inválida`);
        return false;
      }

      if (currentBlock.previousHash !== previousBlock.hash) {
        logger.warn(
          `Bloco #${i} tem referência de bloco anterior inválida`,
        );
        return false;
      }
    }

    return true;
  }

  auditarAcao(tipo, usuarioId, recurso, dados) {
    const auditData = {
      tipo,
      usuarioId,
      recurso,
      dados,
      timestamp: Date.now(),
      ipAddress: dados.ipAddress || "unknown",
      userAgent: dados.userAgent || "unknown",
    };

    const transactionHash = this.createTransaction(auditData);

    if (this.pendingTransactions.length >= 5) {
      this.minePendingTransactions();
    }

    return {
      transactionHash,
      bloco: this.getLatestBlock().index,
      timestamp: auditData.timestamp,
    };
  }

  obterHistoricoAuditoria(recurso) {
    const auditoria = [];

    for (const block of this.chain) {
      for (const transaction of block.transactions) {
        if (transaction.data.recurso === recurso) {
          auditoria.push({
            ...transaction.data,
            bloco: block.index,
            transactionHash: transaction.hash,
            blockHash: block.hash,
          });
        }
      }
    }

    return auditoria;
  }

  verificarIntegridade(recurso) {
    if (!this.isChainValid()) {
      return {
        valido: false,
        erro: "Blockchain foi comprometido",
      };
    }

    const auditoria = this.obterHistoricoAuditoria(recurso);

    return {
      valido: true,
      registros: auditoria.length,
      ultimoRegistro: auditoria[auditoria.length - 1] || null,
    };
  }
}

class Block {
  constructor(index, timestamp, transactions, previousHash) {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = this.calculateBlockHash();
  }

  calculateBlockHash() {
    return crypto
      .createHash("sha256")
      .update(
        this.index +
          this.previousHash +
          this.timestamp +
          JSON.stringify(this.transactions) +
          this.nonce,
      )
      .digest("hex");
  }

  hasValidProof(difficulty) {
    const hash = this.calculateBlockHash();
    return hash.substring(0, difficulty) === "0".repeat(difficulty);
  }
}

module.exports = new BlockchainAuditService();
