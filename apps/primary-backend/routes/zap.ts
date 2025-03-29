import express from "express";
import { authMiddleware } from "../middleware";
export const zapRouter = express.Router();

zapRouter.post("/", authMiddleware,  async(req, res)=>{
    try {
        
    } catch (error) {
        
    }
})

zapRouter.get("/", authMiddleware,  async(req, res)=>{
    try {
        
    } catch (error) {
        
    }
})

zapRouter.get("/:zapId", async(req, res)=>{
    try {
        
    } catch (error) {
        
    }
})