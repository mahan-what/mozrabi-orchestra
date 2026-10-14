/** Standard response envelope: { success: true, data, meta? } | { success: false, error: { code, message, details? } } */
export const ok = (res, data, meta, status = 200) => {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
};
export const created = (res, data) => ok(res, data, undefined, 201);
export const noContent = (res) => res.status(204).end();
export const fail = (res, status, code, message, details) =>
  res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });

export function pageMeta(page, pageSize, total) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
