import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChatsTab } from './Perfil'

export default function ClienteChats() {
  const location = useLocation()
  const navigate = useNavigate()
  const [openTicketId, setOpenTicketId] = useState(
    location.state?.openTicketId ? String(location.state.openTicketId) : null,
  )

  const consumeOpenTicket = () => {
    setOpenTicketId(null)
    navigate(location.pathname, { replace: true, state: {} })
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <ChatsTab
        initialOpenTicketId={openTicketId}
        onConsumedOpenTicket={consumeOpenTicket}
      />
    </div>
  )
}
