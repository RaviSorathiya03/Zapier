import type { NextFunction } from "express";
import jwt from "jsonwebtoken";

export function authMiddleware(req:Request, res: any, next: NextFunction){
    try {
        //@ts-ignore
    const header:string = req.headers.authorization as unknown as string;
    const payload = jwt.verify(header, process.env.JWT_SECRET!);
    console.log(payload)
    if(payload){
        //@ts-ignore
        req.userId = payload.id;
        next();
    }
    } catch (error) {
        console.log(error);
        return res.status(403).json({
            message: "Unauthorize"
        })
    }
}   