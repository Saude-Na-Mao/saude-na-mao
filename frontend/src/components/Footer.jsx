import { Heart, MapPin, Phone, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-gray-900 text-gray-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-10">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <span className="font-bold text-white text-lg">Saúde na Mão</span>
            </div>
            <p className="text-sm leading-relaxed">
              Medicamentos com entrega rápida e confiável. Sua saúde é nossa prioridade.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Navegação</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/" className="hover:text-primary transition">Início</Link></li>
              <li><Link to="/produtos" className="hover:text-primary transition">Produtos</Link></li>
              <li><Link to="/pedidos" className="hover:text-primary transition">Meus Pedidos</Link></li>
              <li><Link to="/suporte" className="hover:text-primary transition">Suporte</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Legal</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link to="/legal" className="hover:text-primary transition">Termos de Uso</Link></li>
              <li><Link to="/legal" className="hover:text-primary transition">Política de Privacidade</Link></li>
              <li><Link to="/legal" className="hover:text-primary transition">FAQ</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Contato</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
                <span>Goiânia - GO, Brasil</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 flex-shrink-0 text-primary" />
                <a href="tel:0800123456" className="hover:text-primary transition">0800 123 456</a>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 flex-shrink-0 text-primary" />
                <a href="mailto:contato@saudenamao.com.br" className="hover:text-primary transition">contato@saudenamao.com.br</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-500">
            © {currentYear} Saúde na Mão. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-1 text-sm text-gray-500">
            Feito com <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500 mx-0.5" /> para sua saúde
          </div>
        </div>
      </div>
    </footer>
  )
}
