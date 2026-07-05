import { describe, it, expect, vi } from 'vitest';
import { requireRole } from '../../src/middleware/requireRole.js';

function runMw(mw, req) {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  mw(req, res, next);
  return { res, next };
}

describe('requireRole', () => {
  it('allows matching role', () => {
    const mw = requireRole('Admin', 'Responder');
    const { res, next } = runMw(mw, { user: { role: 'Responder' } });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects missing user', () => {
    const mw = requireRole('Admin');
    const { res, next } = runMw(mw, {});
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects role escalation (wrong role)', () => {
    const mw = requireRole('Admin');
    const { res, next } = runMw(mw, { user: { role: 'Public' } });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
