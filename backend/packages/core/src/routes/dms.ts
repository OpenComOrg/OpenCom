import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulidLike } from "@ods/shared/ids.js";
import { q } from "../db.js";

const CreateThread = z.object({ otherUserId: z.string().min(3) });

const SendDM = z.object({
  threadId: z.string().min(3),
  senderDeviceId: z.string().min(3),
  recipientDeviceId: z.string().min(3),
  header: z.record(z.any()),
  ciphertext: z.string().min(1)
});

export async function dmRoutes(app: FastifyInstance, broadcastDM: (recipientDeviceId: string, payload: any) => void) {
  app.post("/v1/dms/create", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const userId = req.user.sub as string;
    const body = CreateThread.parse(req.body);

    const a = userId;
    const b = body.otherUserId;
    const [u1, u2] = a < b ? [a, b] : [b, a];

    const existing = await q<{ id: string }>(
      `SELECT id FROM dm_threads WHERE user_a=$1 AND user_b=$2`,
      [u1, u2]
    );
    if (existing.length) return rep.send({ threadId: existing[0].id });

    const id = ulidLike();
    await q(`INSERT INTO dm_threads (id,user_a,user_b) VALUES ($1,$2,$3)`, [id, u1, u2]);
    return rep.send({ threadId: id });
  });

  app.post("/v1/dms/send", { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
    const body = SendDM.parse(req.body);

    const msgId = ulidLike();
    const sentAt = new Date().toISOString();

    await q(
      `INSERT INTO dm_messages (id,thread_id,sender_device_id,recipient_device_id,header,ciphertext,sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [msgId, body.threadId, body.senderDeviceId, body.recipientDeviceId, body.header, body.ciphertext, sentAt]
    );

    // Realtime push to recipient device if connected
    // inside send route:
    await broadcastDM(body.recipientDeviceId, {
      messageId: msgId,
      threadId: body.threadId,
      senderDeviceId: body.senderDeviceId,
      recipientDeviceId: body.recipientDeviceId,
      header: body.header,
      ciphertext: body.ciphertext,
      sentAt
    });


    return rep.send({ ok: true, messageId: msgId, sentAt });
  });
}
