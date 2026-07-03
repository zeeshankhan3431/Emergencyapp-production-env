/** @typedef {'Admin' | 'Responder' | 'Analyst' | 'Public'} UserRole */

export const ROLES = /** @type {const} */ (['Admin', 'Responder', 'Analyst', 'Public']);

/** @param {unknown} r */
export function isValidRole(r) {
  return typeof r === 'string' && ROLES.includes(/** @type {UserRole} */ (r));
}
