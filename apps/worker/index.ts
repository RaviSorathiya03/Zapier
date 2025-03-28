import { Kafka } from "kafkajs";
const kafka = new Kafka({
    clientId: "worker-kafka", 
    brokers: ["localhost: 9092"]
})
async function main(){
    const consumer = kafka.consumer({
        groupId: "main-worker"
    });

    await consumer.connect();

    await consumer.subscribe({topic: "zap-events", fromBeginning: true});

    await consumer.run({
        eachMessage: async ({topic, partition, message})=>{
            console.log({
                partition,
                offset: message.offset,
                value: message.value?.toString(),
            })

            await new Promise((r)=> setTimeout(r, 1000));
        }
    })
}

main();