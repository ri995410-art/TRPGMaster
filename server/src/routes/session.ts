import { Router } from 'express';
import type { SessionRegistry } from '../core/SessionRegistry';
import type { SocketServer } from '../network/SocketServer';

export function createSessionRouter(
  sessionRegistry: SessionRegistry,
  socketServer: SocketServer,
  getDefaultStateManager: () => import('../core/StateManager').StateManager,
): Router {
  const router = Router();

  router.get('/api/session', (_req, res) => {
    res.json(getDefaultStateManager().getState());
  });

  router.get('/api/sessions', (_req, res) => {
    const sessions = sessionRegistry.getAllSessionsDetailed();
    res.json({ sessions });
  });

  router.post('/api/session/start', (_req, res) => {
    getDefaultStateManager().startSession();
    res.json({ status: 'started' });
  });

  router.post('/api/session/end', (_req, res) => {
    getDefaultStateManager().endSession();
    res.json({ status: 'ended' });
  });

  router.post('/api/session/create', (_req, res) => {
    const { sessionId, code, stateManager: sm } = sessionRegistry.createSession();
    sm.onChange('state', (state) => {
      socketServer.broadcastState(state);
      sessionRegistry.markDirty(state.sessionId);
    });
    sessionRegistry.persistSession(sessionId);
    res.json({ sessionId, code });
  });

  router.get('/api/session/by-code/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    const info = sessionRegistry.getSessionInfoByCode(code);
    if (!info) {
      res.status(404).json({ error: '房间码无效' });
      return;
    }
    // Extend with player names
    const sm = sessionRegistry.findByCode(code);
    const players = sm ? sm.getState().players.map(p => ({
      id: p.id,
      name: p.name,
      characterName: p.character?.name,
    })) : [];
    res.json({ ...info, players });
  });

  router.get('/api/session/:id/players', (req, res) => {
    const sm = sessionRegistry.findById(req.params.id);
    if (!sm) {
      res.status(404).json({ error: '会话不存在' });
      return;
    }
    const state = sm.getState();
    res.json({
      players: state.players.map(p => ({
        id: p.id,
        name: p.name,
        characterName: p.character?.name,
        isConnected: p.isConnected,
        joinedAt: p.joinedAt,
      })),
    });
  });

  return router;
}
