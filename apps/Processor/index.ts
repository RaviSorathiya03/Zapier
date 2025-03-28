import { db } from "db/client";
import { Kafka } from "kafkajs";


const kafka = new Kafka({
    clientId: "outbox=processor",
    brokers: ['localhost:9092']
})

async function main(){
    const producer = kafka.producer();
    await producer.connect();
    while(1){
       try {
        const pendingRows = await db.zapRunOutbox.findMany({
            where:{},
            take: 10
        })

        producer.send({
            topic: "zap-events",
            messages: pendingRows.map(r=>({
                value: r.zapRunId
            }))
        })
        
        await db.zapRunOutbox.deleteMany({
            where:{
                id:{
                    in: pendingRows.map(r=> r.id)
                }
            }
        })
       
       } catch (error) {
         console.log(error)    
       }
    }
}

main();


