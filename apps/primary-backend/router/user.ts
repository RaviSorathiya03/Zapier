import express from "express";
import { authMiddleware } from "../middleware";
import { SigninSchema, SignupSchema } from "../types";
export const userRouter = express.Router();
import type { Request, Response } from "express";
import { db } from "db/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

userRouter.post("/signup", async (req: Request, res: any)=>{
    try {
        const data = SignupSchema.safeParse(req.body);
        console.log(req.body);
        if(!data.success){
            return res.status(403).json({
                message: "Something went wrong"
            })
        }
        const existingUser = await db.user.findFirst({
            where:{
                email: data.data.username
            }
        })

        if(existingUser){
            return res.status(400).json({
                message: "User already exist in the db"
            })
        }

        const hashedPassword = await bcrypt.hash(req.body.password, 10);

        const saveUser = await db.user.create({
            data:{
                email: data.data.username, 
                password: (hashedPassword).toString(),
                name: data.data.name
            }
        })

        res.status(200).json({
            saveUser
        })
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Something went wrong"
        })
    }
})

userRouter.post("/signin", async (req: any, res:any)=>{
    try {
        const data = SigninSchema.safeParse(req.body);
        if(!data.success){
            return res.status(400).json({
                message: "Something went wrong"
            })
        }

        

        const user = await db.user.findFirst({
            where:{
                email: data.data.username
            }
        })

        if(req.body.username != user?.email){
            return res.status(400).json({
                message: "Username or password is incorrect"
            })
        }

        const passwordCompare = await bcrypt.compare(req.body.password, user?.password || "")
        if(!passwordCompare){
            return res.status(400).json({
                message: "Something went wrong"
            })
        }

        const token = jwt.sign({
            id: user?.id,
        }, process.env.JWT_SECRET!)

        return res.status(200).json({
            
            token:token
        })
        
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            message: "Something went wrong"
        })
    }
})

//@ts-ignore

userRouter.get("/user", authMiddleware, async(req, res)=>{
    try {
        //@ts-ignore
        const id = req.userId;
        console.log("id", id)
        const user = await db.user.findFirst({
            where:{
                id: parseInt(id)
            }, select:{
                name: true, 
                email: true
            }
        })

        return res.status(200).json({
            user
        })
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            message: "Something went wrong"
        })
    }
})
