/**
 * @param {...string} allowedRoles
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient permissions for this resource' });
    }
    next();
  };
}
