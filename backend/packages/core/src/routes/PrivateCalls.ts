import { q } from "../db.js";
import type { FastifyInstance } from "fastify";

// Error Code Syntax for future ref:
// 420: Database Error
// 421: Missing caller paramter
// 422: Missing callid Paramater


export async function CallRoutes(app: FastifyInstance) { 

    app.post("/call/get_status",  { preHandler: [app.authenticate] } as any, async (req: any, rep) => {
        const userId = req.user.sub as string;
        const body = req.body;
        
        const caller = req.body.caller;

        const call_id = req.body.callid;

        const status = false

        if (!caller) {
            return rep.send({'error': true, 'code': 421} )
        }
        if (!call_id) {
            return rep.send({'error': true, 'code': 422} )
        }

        // Preety simple db handalling should probably improve later
        const existing = await q<{ status: boolean }>(
            `SELECT status FROM private_calls WHERE caller=$1 AND call_id=$2`,
            [caller, call_id]
        );
        // this might make up for it, is good enough for right now
        if (existing.length) {
            const status = existing[0].status;
        } else {
            return rep.send({'success': false, 'error': true, 'code': 420})
        }
        return rep.send({'success': true, 'status': status})
    });
}