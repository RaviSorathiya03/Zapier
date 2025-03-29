import {z} from "zod";


export const signupSchema = z.object({
    username: z.string(),
    password: z.string().min(8),
    name: z.string()
})

export const signinSchema = z.object({
    username: z.string(),
    password: z.string()
})