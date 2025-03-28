import express from "express";
const app = express();
import { db } from "db/client";

app.post("/hook/catch/:userId/:zapId", async(req, res)=>{
    try {
        const userId = req.params.userId;
        const zapId = req.params.zapId;
        const body = req.body;

        await db.$transaction(async tx=>{
            const run = await tx.zapRun.create({
                data:{
                    zapId: zapId,
                    metadata: body
                }
            })

            await tx.zapRunOutbox.create({
                data:{
                    zapRunId: run.id
                }
            })
        })

        res.status(200).json({
            message: "Zap is in the processing stage"
        })
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Something went wrong"
        })
    }
})

app.listen(8080, ()=>{
    console.log("server is running on port 8080")
})