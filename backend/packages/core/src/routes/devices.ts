import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";

const RegisterDevice = z.object({
  name: z.string().max(64).optional(),
  identityPubkey: z.string().min(10),
  prekeyBundle: z.record(z.any())
});

export async function deviceRoutes(app: FastifyInstance) {
  app.post("/v1/devices/register", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = RegisterDevice.parse(req.body);

    const id = ulidLike();
    await q(
      `INSERT INTO devices (id,user_id,name,identity_pubkey,prekey_bundle) VALUES ($1,$2,$3,$4,$5)`,
      [id, userId, body.name ?? null, body.identityPubkey, body.prekeyBundle]
    );

    return rep.send({ deviceId: id });
  });

  app.get("/v1/users/:userId/prekeys", async (req, rep) => {
    const { userId } = z.object({ userId: z.string().min(3) }).parse(req.params);
    const rows = await q<{ id: string; identity_pubkey: string; prekey_bundle: any }>(
      `SELECT id,identity_pubkey,prekey_bundle FROM devices WHERE user_id=$1 ORDER BY created_at ASC`,
      [userId]
    );
    return rep.send({ devices: rows.map(r => ({ deviceId: r.id, identityPubkey: r.identity_pubkey, prekeyBundle: r.prekey_bundle })) });
  });
}
