import { describe, it, expect, beforeEach } from 'vitest';
import {
  verifyToken,
  verifyGuestToken,
  verifyAccessToken,
  createSession,
  validateSession,
  getSessionRecord,
  hashSessionId,
} from '../src/auth.js';
import {
  loadConfig,
  saveConfig,
  regeneratePlainToken,
  regenerateGuestToken,
  revokeGuestToken,
  getPlainGuestToken,
} from '../src/config.js';
import {
  createChat,
  getChats,
  getAllGuestChats,
  getChatById,
  revokeGuestSessionsDb,
} from '../src/db.js';

describe('Guest Mode Authentication & Scoping', () => {
  let adminToken: string;
  let guestToken: string;

  beforeEach(() => {
    adminToken = regeneratePlainToken();
    guestToken = regenerateGuestToken();
  });

  it('correctly verifies admin and guest tokens', () => {
    expect(verifyAccessToken(adminToken)).toBe(true);
    expect(verifyGuestToken(guestToken)).toBe(true);
    expect(verifyGuestToken(adminToken)).toBe(false);
    expect(verifyAccessToken(guestToken)).toBe(false);

    const adminCheck = verifyToken(adminToken);
    expect(adminCheck.valid).toBe(true);
    expect(adminCheck.role).toBe('admin');

    const guestCheck = verifyToken(guestToken);
    expect(guestCheck.valid).toBe(true);
    expect(guestCheck.role).toBe('guest');

    const fakeCheck = verifyToken('invalid-token-xyz');
    expect(fakeCheck.valid).toBe(false);
  });

  it('revoking guest token invalidates verification and active guest sessions', () => {
    const guestSid = createSession('GuestAgent', 'local', 'guest');
    const adminSid = createSession('AdminAgent', 'local', 'admin');

    expect(validateSession(guestSid)).toBe(true);
    expect(validateSession(adminSid)).toBe(true);

    revokeGuestToken();
    revokeGuestSessionsDb();

    expect(verifyGuestToken(guestToken)).toBe(false);
    expect(getPlainGuestToken()).toBeNull();

    // Guest session must be revoked
    expect(validateSession(guestSid)).toBe(false);
    // Admin session remains valid
    expect(validateSession(adminSid)).toBe(true);
  });

  it('isolates guest chat history from admin and between guest sessions', () => {
    const adminChat = createChat({
      id: `chat_admin_${Date.now()}`,
      title: 'Admin Chat',
      mode: 'chat',
      model_id: 'test_model',
      guest_session_id: null,
    });

    const guest1Session = 'hash_guest_1';
    const guest2Session = 'hash_guest_2';

    const guest1Chat = createChat({
      id: `chat_g1_${Date.now()}`,
      title: 'Guest 1 Chat',
      mode: 'chat',
      model_id: 'test_model',
      guest_session_id: guest1Session,
    });

    const guest2Chat = createChat({
      id: `chat_g2_${Date.now()}`,
      title: 'Guest 2 Chat',
      mode: 'chat',
      model_id: 'test_model',
      guest_session_id: guest2Session,
    });

    // Admin chats list does not include guest chats
    const adminChats = getChats(null);
    expect(adminChats.some((c) => c.id === adminChat.id)).toBe(true);
    expect(adminChats.some((c) => c.id === guest1Chat.id)).toBe(false);
    expect(adminChats.some((c) => c.id === guest2Chat.id)).toBe(false);

    // Guest 1 sees only their chat
    const g1Chats = getChats(guest1Session);
    expect(g1Chats.some((c) => c.id === guest1Chat.id)).toBe(true);
    expect(g1Chats.some((c) => c.id === adminChat.id)).toBe(false);
    expect(g1Chats.some((c) => c.id === guest2Chat.id)).toBe(false);

    // Guest 2 sees only their chat
    const g2Chats = getChats(guest2Session);
    expect(g2Chats.some((c) => c.id === guest2Chat.id)).toBe(true);
    expect(g2Chats.some((c) => c.id === guest1Chat.id)).toBe(false);

    // Admin inspection route gets all guest chats
    const allGuestChats = getAllGuestChats();
    expect(allGuestChats.some((c) => c.id === guest1Chat.id)).toBe(true);
    expect(allGuestChats.some((c) => c.id === guest2Chat.id)).toBe(true);
    expect(allGuestChats.some((c) => c.id === adminChat.id)).toBe(false);
  });
});
