#!/bin/bash
# Script de execução rápida dos testes SSM

echo "🚀 SSM - Teste Suite Execution"
echo "================================"
echo ""

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

cd backend

echo -e "${BLUE}📦 Verificando dependências...${NC}"
if [ ! -d "node_modules" ]; then
    echo "Instalando dependências..."
    npm install
fi

echo ""
echo -e "${BLUE}📋 Menu de Testes${NC}"
echo "1) Executar TODOS os testes"
echo "2) Executar apenas INTEGRAÇÃO"
echo "3) Executar apenas FRAUDE"
echo "4) Executar com COVERAGE"
echo "5) Watch mode INTEGRAÇÃO"
echo "6) Watch mode FRAUDE"
echo "0) Sair"
echo ""
read -p "Escolha uma opção (0-6): " option

case $option in
    1)
        echo -e "${YELLOW}▶ Executando todos os testes...${NC}"
        npm run test:all
        ;;
    2)
        echo -e "${YELLOW}▶ Executando testes de INTEGRAÇÃO...${NC}"
        npm run test:integration
        ;;
    3)
        echo -e "${YELLOW}▶ Executando testes de FRAUDE...${NC}"
        npm run test:fraud
        ;;
    4)
        echo -e "${YELLOW}▶ Executando com COVERAGE...${NC}"
        npm run test:coverage
        echo -e "${GREEN}✅ Relatório gerado em: coverage/index.html${NC}"
        ;;
    5)
        echo -e "${YELLOW}▶ Watch mode - INTEGRAÇÃO${NC}"
        npm run test:integration:watch
        ;;
    6)
        echo -e "${YELLOW}▶ Watch mode - FRAUDE${NC}"
        npm run test:fraud:watch
        ;;
    0)
        echo "Saindo..."
        exit 0
        ;;
    *)
        echo -e "${RED}Opção inválida!${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✅ Testes concluídos!${NC}"
