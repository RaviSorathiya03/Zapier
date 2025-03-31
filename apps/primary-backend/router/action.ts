

import { Router } from "express";
import { db } from "db/client";

const router = Router();

router.get("/available", async (req, res) => {
    const availableActions = await db.availableAction.findMany({});
    res.json({
        availableActions
    })
});

export const actionRouter = router;