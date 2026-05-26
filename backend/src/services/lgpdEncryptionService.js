const crypto = require("crypto");
const Logger = require("../utils/logger");

const logger = new Logger("LGPDEncryptionService");

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
const ALGORITHM = "aes-256-gcm";

class LGPDEncryptionService {
  encriptarDados(dados) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

      let encrypted = cipher.update(JSON.stringify(dados), "utf8", "hex");
      encrypted += cipher.final("hex");

      const authTag = cipher.getAuthTag();

      logger.info("Dados encriptados com sucesso");

      return {
        encrypted,
        iv: iv.toString("hex"),
        authTag: authTag.toString("hex"),
      };
    } catch (error) {
      logger.error("Erro ao encriptar dados:", error);
      throw error;
    }
  }

  descriptarDados(encrypted, iv, authTag) {
    try {
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        ENCRYPTION_KEY,
        Buffer.from(iv, "hex"),
      );

      decipher.setAuthTag(Buffer.from(authTag, "hex"));

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      logger.info("Dados descriptados com sucesso");

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error("Erro ao descriptarDados:", error);
      throw error;
    }
  }

  gerarHashCriptografico(dados) {
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(dados))
      .digest("hex");

    logger.info("Hash criptográfico gerado");

    return hash;
  }

  gerarAssinaturaPKI(dados, chavePrivada) {
    try {
      const sign = crypto.createSign("sha256");
      sign.update(JSON.stringify(dados));

      const assinatura = sign.sign(chavePrivada, "hex");

      logger.info("Assinatura PKI gerada com sucesso");

      return assinatura;
    } catch (error) {
      logger.error("Erro ao gerar assinatura PKI:", error);
      throw error;
    }
  }

  verificarAssinaturaPKI(dados, assinatura, chavePublica) {
    try {
      const verify = crypto.createVerify("sha256");
      verify.update(JSON.stringify(dados));

      const isValid = verify.verify(chavePublica, assinatura, "hex");

      if (isValid) {
        logger.info("Assinatura PKI válida");
      } else {
        logger.warn("Assinatura PKI inválida");
      }

      return isValid;
    } catch (error) {
      logger.error("Erro ao verificar assinatura PKI:", error);
      throw error;
    }
  }

  anonimizar(email) {
    const [localPart, domain] = email.split("@");
    const firstChar = localPart[0];
    const lastChar = localPart[localPart.length - 1];
    const anonimizado =
      firstChar + "*".repeat(localPart.length - 2) + lastChar + "@" + domain;

    logger.info(`Email anonimizado: ${anonimizado}`);

    return anonimizado;
  }

  mascararCPF(cpf) {
    return cpf.substring(0, 3) + "." + "***" + "." + cpf.substring(8);
  }

  mascararTelefone(telefone) {
    return (
      telefone.substring(0, 2) +
      " 9****-" +
      telefone.substring(telefone.length - 4)
    );
  }

  gerarTokenAcesso(usuarioId, expiracaoMinutos = 30) {
    const payload = {
      usuarioId,
      timestamp: Date.now(),
      expiracao: Date.now() + expiracaoMinutos * 60 * 1000,
    };

    const token = crypto.randomBytes(32).toString("hex");
    const hash = this.gerarHashCriptografico(payload + token);

    logger.info("Token de acesso gerado");

    return {
      token,
      hash,
      expiracao: payload.expiracao,
    };
  }

  verificarTokenAcesso(token, hash, expiracaoTimestamp) {
    if (Date.now() > expiracaoTimestamp) {
      logger.warn("Token de acesso expirado");
      return false;
    }

    const payload = {
      timestamp: Date.now(),
      expiracao: expiracaoTimestamp,
    };

    const novoHash = this.gerarHashCriptografico(payload + token);

    const isValid = hash === novoHash;

    if (isValid) {
      logger.info("Token de acesso válido");
    } else {
      logger.warn("Token de acesso inválido");
    }

    return isValid;
  }

  sanitizarDadosPessoais(dados) {
    const sanitizado = { ...dados };

    if (sanitizado.email) {
      sanitizado.email = this.anonimizar(sanitizado.email);
    }

    if (sanitizado.cpf) {
      sanitizado.cpf = this.mascararCPF(sanitizado.cpf);
    }

    if (sanitizado.telefone) {
      sanitizado.telefone = this.mascararTelefone(sanitizado.telefone);
    }

    logger.info("Dados pessoais sanitizados");

    return sanitizado;
  }

  registrarConsentimento(usuarioId, tipoConsentimento, consentimento) {
    const record = {
      usuarioId,
      tipoConsentimento,
      consentimento,
      dataConsentimento: new Date(),
      hash: this.gerarHashCriptografico({ usuarioId, tipoConsentimento }),
    };

    logger.info(
      `Consentimento registrado: ${tipoConsentimento} para usuário ${usuarioId}`,
    );

    return record;
  }
}

module.exports = new LGPDEncryptionService();
