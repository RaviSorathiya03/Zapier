

import { Router } from "express";
import { db } from "db/client";

const router = Router();

router.get("/available", async (req, res) => {
    const availableTriggers = await db.availableTrigger.findMany({});
    res.json({
        availableTriggers
    })
});

export const triggerRouter = router;