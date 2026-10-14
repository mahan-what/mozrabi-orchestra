import * as catalog from "../services/catalogService.js";
import { ok, created, pageMeta } from "../lib/respond.js";

export async function concerts(req, res) {
  const { phase, page, pageSize } = req.valid.query;
  const { total, items } = await catalog.listConcerts({ phase, page, pageSize });
  return ok(res, items, pageMeta(page, pageSize, total));
}
export const concert = async (req, res) => ok(res, await catalog.getConcert(req.valid.params.id));
export const seats = async (req, res) => {
  res.set("Cache-Control", "no-store"); // availability must never be served from a cache
  return ok(res, await catalog.getSeatMap(req.valid.params.id));
};
export const members = async (_req, res) => ok(res, await catalog.listMembers());
export const instruments = async (_req, res) => ok(res, await catalog.listInstruments());
export const gallery = async (req, res) => ok(res, await catalog.listGallery({ limit: req.valid.query?.limit }));
export const contact = async (req, res) => created(res, await catalog.createContactMessage(req.valid.body));
