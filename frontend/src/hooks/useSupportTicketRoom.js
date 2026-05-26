import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { getSocketUrl, SOCKET_TRANSPORTS } from '../config/env';
import { normalizeSupportMessage } from '../utils/supportMessageUtils';

/**
 * Entra na sala support:{ticketId} e repassa mensagens normalizadas.
 * @param {object} opts
 * @param {import('socket.io-client').Socket | null} [opts.socket] - reutilizar socket existente
 * @param {string} opts.token
 * @param {string} opts.userId
 * @param {string} opts.ticketId
 * @param {boolean} opts.enabled
 * @param {(msg: object, meta: { ticketId: string }) => void} opts.onMessage
 */
export function useSupportTicketRoom({
  socket: externalSocket = null,
  token,
  userId,
  ticketId,
  enabled = true,
  onMessage,
}) {
  const onMessageRef = useRef(onMessage);
  const ownsSocketRef = useRef(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!enabled || !token || !userId || !ticketId) return undefined;

    let socket = externalSocket;
    if (!socket) {
      socket = io(getSocketUrl(), {
        auth: { token },
        transports: SOCKET_TRANSPORTS,
      });
      ownsSocketRef.current = true;
    } else {
      ownsSocketRef.current = false;
    }

    const tid = String(ticketId);
    const joinRoom = () => {
      socket.emit('join:support', { ticketId: tid, userId });
    };

    const handleMessage = (payload = {}) => {
      const evtId = payload.ticketId ? String(payload.ticketId) : tid;
      if (evtId !== tid) return;
      const normalized = normalizeSupportMessage(payload.mensagem);
      if (!normalized) return;
      onMessageRef.current?.(normalized, { ticketId: evtId });
    };

    if (socket.connected) {
      joinRoom();
    }
    socket.on('connect', joinRoom);
    socket.on('support:message', handleMessage);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('support:message', handleMessage);
      if (ownsSocketRef.current) {
        socket.disconnect();
      }
    };
  }, [externalSocket, token, userId, ticketId, enabled]);

  return null;
}
